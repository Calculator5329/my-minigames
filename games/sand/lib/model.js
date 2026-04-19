// games/sand/lib/model.js
// Dual-entry module: works in Node (CommonJS) and in the browser (window.NDP.Sand.Model).
// Implements a minimal graph data model with nodes + wires, plus JSON (de)serialization.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod.Model;
    module.exports.Model = mod.Model;
    module.exports.History = mod.History;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Model = mod.Model;
    window.NDP.Sand.History = mod.History;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // --- Temporary pin map ---------------------------------------------------
  // TODO(task-5): replace with the real primitive registry. For now we only
  // know about pad_in / pad_out; other node types accept any pin name.
  const PIN_MAP = {
    pad_in: { out: true },
    pad_out: { in: true },
  };

  function hasPin(type, pin) {
    const pins = PIN_MAP[type];
    if (!pins) return true; // unknown type: allow any pin (until Task 5)
    return Object.prototype.hasOwnProperty.call(pins, pin);
  }

  function create() {
    return {
      nodes: {},       // id -> node
      wires: {},       // id -> wire
      _nextNodeId: 1,
      _nextWireId: 1,
    };
  }

  function addNode(graph, spec) {
    const id = 'n' + graph._nextNodeId++;
    const node = {
      id,
      type: spec.type,
      x: spec.x | 0,
      y: spec.y | 0,
      label: spec.label || '',
      props: spec.props ? { ...spec.props } : {},
    };
    graph.nodes[id] = node;
    return node;
  }

  function removeNode(graph, id) {
    if (!graph.nodes[id]) return false;
    delete graph.nodes[id];
    // cascade: drop any wire touching this node
    for (const wid of Object.keys(graph.wires)) {
      const w = graph.wires[wid];
      if (w.from.node === id || w.to.node === id) {
        delete graph.wires[wid];
      }
    }
    return true;
  }

  function wireKey(w) {
    return w.from.node + '\u0000' + w.from.pin + '\u0000' + w.to.node + '\u0000' + w.to.pin;
  }

  function addWire(graph, spec) {
    const from = spec.from, to = spec.to;
    if (!from || !to) return null;
    const nFrom = graph.nodes[from.node];
    const nTo = graph.nodes[to.node];
    if (!nFrom || !nTo) return null;
    if (!hasPin(nFrom.type, from.pin)) return null;
    if (!hasPin(nTo.type, to.pin)) return null;

    const key = wireKey({ from, to });
    for (const wid of Object.keys(graph.wires)) {
      if (wireKey(graph.wires[wid]) === key) return null;
    }

    const id = 'w' + graph._nextWireId++;
    const wire = {
      id,
      from: { node: from.node, pin: from.pin },
      to: { node: to.node, pin: to.pin },
    };
    graph.wires[id] = wire;
    return wire;
  }

  function removeWire(graph, id) {
    if (!graph.wires[id]) return false;
    delete graph.wires[id];
    return true;
  }

  // Numeric suffix of an id like "n12" / "w3" for stable sorting.
  function idNum(id) {
    const m = /(\d+)$/.exec(id);
    return m ? parseInt(m[1], 10) : 0;
  }

  function sortById(arr) {
    return arr.slice().sort((a, b) => {
      const da = idNum(a.id), db = idNum(b.id);
      if (da !== db) return da - db;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  function serializeNode(n) {
    // Deterministic key order.
    return {
      id: n.id,
      type: n.type,
      x: n.x,
      y: n.y,
      label: n.label || '',
      props: n.props ? { ...n.props } : {},
    };
  }

  function serializeWire(w) {
    return {
      id: w.id,
      from: { node: w.from.node, pin: w.from.pin },
      to: { node: w.to.node, pin: w.to.pin },
    };
  }

  function toJSON(graph) {
    const nodes = sortById(Object.values(graph.nodes)).map(serializeNode);
    const wires = sortById(Object.values(graph.wires)).map(serializeWire);
    return {
      version: 1,
      nodes,
      wires,
      nextNodeId: graph._nextNodeId,
      nextWireId: graph._nextWireId,
    };
  }

  function fromJSON(obj) {
    const g = create();
    const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
    const wires = Array.isArray(obj.wires) ? obj.wires : [];
    let maxNode = 0, maxWire = 0;
    for (const n of nodes) {
      g.nodes[n.id] = {
        id: n.id,
        type: n.type,
        x: n.x | 0,
        y: n.y | 0,
        label: n.label || '',
        props: n.props ? { ...n.props } : {},
      };
      maxNode = Math.max(maxNode, idNum(n.id));
    }
    for (const w of wires) {
      g.wires[w.id] = {
        id: w.id,
        from: { node: w.from.node, pin: w.from.pin },
        to: { node: w.to.node, pin: w.to.pin },
      };
      maxWire = Math.max(maxWire, idNum(w.id));
    }
    g._nextNodeId = typeof obj.nextNodeId === 'number' ? obj.nextNodeId : maxNode + 1;
    g._nextWireId = typeof obj.nextWireId === 'number' ? obj.nextWireId : maxWire + 1;
    return g;
  }

  const Model = {
    create,
    addNode,
    removeNode,
    addWire,
    removeWire,
    toJSON,
    fromJSON,
  };

  // --- History (undo/redo) -------------------------------------------------

  function snapshot(graph) {
    return JSON.stringify(toJSON(graph));
  }

  function hydrate(snap) {
    return fromJSON(JSON.parse(snap));
  }

  function historyCreate(graph, opts) {
    const cap = (opts && typeof opts.cap === 'number') ? opts.cap : 100;
    return {
      cap: Math.max(1, cap | 0),
      past: [],              // prior snapshots (undo stack)
      present: snapshot(graph),
      future: [],            // redo stack
    };
  }

  function historyCommit(history, graph) {
    history.past.push(history.present);
    history.present = snapshot(graph);
    history.future.length = 0;
    // Ring buffer: cap applies to the undo depth (past length).
    while (history.past.length > history.cap) {
      history.past.shift();
    }
  }

  function historyCanUndo(history) {
    return history.past.length > 0;
  }

  function historyCanRedo(history) {
    return history.future.length > 0;
  }

  function historyUndo(history) {
    if (history.past.length === 0) return null;
    const prev = history.past.pop();
    history.future.push(history.present);
    history.present = prev;
    return hydrate(prev);
  }

  function historyRedo(history) {
    if (history.future.length === 0) return null;
    const next = history.future.pop();
    history.past.push(history.present);
    history.present = next;
    return hydrate(next);
  }

  const History = {
    create: historyCreate,
    commit: historyCommit,
    undo: historyUndo,
    redo: historyRedo,
    canUndo: historyCanUndo,
    canRedo: historyCanRedo,
  };

  return { Model, History };
});
