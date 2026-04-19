// games/sand/lib/sim.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.Sim).
// Core simulation engine for the sand minigame.
//
// Signals are 3-valued: 0, 1, 'Z' (floating). The sim may also produce 'X'
// (driver conflict). Gates treat 'X' like 'Z' for safety, but the run result
// reports the conflict list.
//
// Wire-OR resolution (for each input pin):
//   - no drivers              -> 'Z'
//   - all drivers are 'Z'/'X' -> 'Z'
//   - mix of 'Z' + single non-Z value -> that value
//   - two or more distinct non-Z values (i.e. both 0 and 1 present) -> 'X' + conflict
//
// Tick model (Task 7):
//   - step() performs ONE discrete tick: snapshot current outputs, run a single
//     _propagate() pass, and report whether anything changed vs the snapshot.
//   - run({ maxTicks }) calls step() until settled or the tick budget is hit.
//     It returns a bounded history (capped at HISTORY_CAP = 256 entries) so
//     that oscillators / long runs don't balloon memory.

(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Sim: mod.Sim };
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Sim = mod.Sim;
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  // Resolve the Primitives registry in both Node and browser contexts.
  let Primitives;
  if (typeof module !== 'undefined' && module.exports) {
    Primitives = require('./primitives.js').Primitives;
  } else if (root && root.NDP && root.NDP.Sand && root.NDP.Sand.Primitives) {
    Primitives = root.NDP.Sand.Primitives;
  } else {
    throw new Error('sim.js: Primitives registry not found');
  }

  // Keep history memory bounded regardless of maxTicks. Oscillators with
  // large budgets would otherwise grow unbounded.
  const HISTORY_CAP = 256;

  function resolveDrivers(drivers) {
    if (drivers.length === 0) return { value: 'Z', conflict: false };
    let seen0 = false, seen1 = false;
    for (const d of drivers) {
      if (d === 0) seen0 = true;
      else if (d === 1) seen1 = true;
    }
    if (seen0 && seen1) return { value: 'X', conflict: true };
    if (seen1) return { value: 1, conflict: false };
    if (seen0) return { value: 0, conflict: false };
    return { value: 'Z', conflict: false };
  }

  function sigKey(v) {
    return v === 0 ? '0' : v === 1 ? '1' : v === 'X' ? 'X' : 'Z';
  }

  function create(graph, opts) {
    // opts.componentRegistry is an optional custom-component map used to
    // resolve node types that aren't in the base Primitives table. When a
    // node's type is unknown to Primitives, we look it up in the registry
    // via Compile.asPrimitive(def) and cache the result per runner.
    const componentRegistry = (opts && opts.componentRegistry) || null;
    let Compile = null;
    const protoCache = {};
    function resolveProto(type) {
      if (Primitives[type]) return Primitives[type];
      if (!componentRegistry) return undefined;
      if (protoCache[type]) return protoCache[type];
      // Lazy-require Compile to avoid a hard dep when registry is not used.
      if (!Compile) {
        if (typeof module !== 'undefined' && module.exports) {
          Compile = require('./compile.js').Compile;
        } else if (root && root.NDP && root.NDP.Sand && root.NDP.Sand.Compile) {
          Compile = root.NDP.Sand.Compile;
        }
      }
      if (!Compile) return undefined;
      const def = Compile.get(componentRegistry, type);
      if (!def) return undefined;
      const p = Compile.asPrimitive(def);
      protoCache[type] = p;
      return p;
    }

    const nodes = {};
    const nodeIds = [];
    for (const id of Object.keys(graph.nodes)) {
      nodes[id] = graph.nodes[id];
      nodeIds.push(id);
    }
    const wires = Object.values(graph.wires).map(w => ({
      from: { node: w.from.node, pin: w.from.pin },
      to:   { node: w.to.node,   pin: w.to.pin   },
    }));

    const wiresByDest = {};
    for (const w of wires) {
      const byNode = wiresByDest[w.to.node] || (wiresByDest[w.to.node] = {});
      const arr = byNode[w.to.pin] || (byNode[w.to.pin] = []);
      arr.push(w.from);
    }

    const state = {};
    const outputs = {};
    const propsOverride = {};

    const padInByLabel = {};
    const padOutByLabel = {};

    // Tick / history bookkeeping.
    let tickCount = 0;
    let history = [];

    function getProto(node) { return resolveProto(node.type); }

    function effectiveProps(node) {
      const base = node.props || {};
      const over = propsOverride[node.id];
      return over ? Object.assign({}, base, over) : base;
    }

    function reset() {
      for (const id of nodeIds) {
        const node = nodes[id];
        const proto = getProto(node);
        if (!proto) continue;
        state[id] = proto.init(effectiveProps(node));
        outputs[id] = {};
        for (const pin of proto.pins.out) outputs[id][pin] = 'Z';
        if (node.type === 'pad_in' && node.props && node.props.label) {
          padInByLabel[node.props.label] = id;
        }
        if (node.type === 'pad_out' && node.props && node.props.label) {
          padOutByLabel[node.props.label] = id;
        }
      }
      for (const k of Object.keys(propsOverride)) delete propsOverride[k];
      tickCount = 0;
      history = [];
    }

    for (const id of nodeIds) {
      const node = nodes[id];
      if (node.type === 'pad_in' && node.props && node.props.label) {
        padInByLabel[node.props.label] = id;
      }
      if (node.type === 'pad_out' && node.props && node.props.label) {
        padOutByLabel[node.props.label] = id;
      }
    }
    reset();

    function setInput(label, value) {
      const id = padInByLabel[label];
      if (!id) return false;
      const v = value === 1 ? 1 : 0;
      propsOverride[id] = Object.assign({}, propsOverride[id], { value: v });
      return true;
    }

    function collectInputs(nodeId) {
      const node = nodes[nodeId];
      const proto = getProto(node);
      const inputs = {};
      const conflicts = [];
      if (!proto) return { inputs, conflicts };
      const byPin = wiresByDest[nodeId] || {};
      for (const pin of proto.pins.in) {
        const sources = byPin[pin] || [];
        const drivers = [];
        for (const src of sources) {
          const out = outputs[src.node];
          if (out && Object.prototype.hasOwnProperty.call(out, src.pin)) {
            drivers.push(out[src.pin]);
          }
        }
        const r = resolveDrivers(drivers);
        inputs[pin] = r.value;
        if (r.conflict) conflicts.push({ node: nodeId, pin });
      }
      return { inputs, conflicts };
    }

    function evalNode(nodeId, nextOutputs) {
      // Evaluate one node using the *current* outputs map for inputs. The new
      // output goes into nextOutputs so that all nodes in this pass see a
      // consistent snapshot (synchronous one-tick semantics).
      const node = nodes[nodeId];
      const proto = getProto(node);
      if (!proto) return { conflicts: [] };
      const { inputs, conflicts } = collectInputs(nodeId);
      const res = proto.eval(inputs, state[nodeId], effectiveProps(node));
      state[nodeId] = res.nextState !== undefined ? res.nextState : state[nodeId];
      const nextOut = {};
      for (const pin of proto.pins.out) {
        const v = res.outputs && Object.prototype.hasOwnProperty.call(res.outputs, pin)
          ? res.outputs[pin]
          : 'Z';
        const norm = (v === 0 || v === 1 || v === 'X') ? v : 'Z';
        nextOut[pin] = norm;
      }
      nextOutputs[nodeId] = nextOut;
      return { conflicts };
    }

    // _propagate: one synchronous pass. All nodes read from the current
    // `outputs` snapshot and write into `nextOutputs`; then we swap.
    // Returns the conflict list for this pass.
    function _propagate() {
      const nextOutputs = {};
      let conflicts = [];
      for (const id of nodeIds) {
        const r = evalNode(id, nextOutputs);
        if (r.conflicts.length) conflicts.push(...r.conflicts);
      }
      // Commit.
      for (const id of nodeIds) {
        outputs[id] = nextOutputs[id] || outputs[id] || {};
      }
      return { conflicts };
    }

    function snapshotOutputs() {
      const snap = {};
      for (const id of nodeIds) {
        const o = outputs[id] || {};
        const copy = {};
        for (const k of Object.keys(o)) copy[k] = o[k];
        snap[id] = copy;
      }
      return snap;
    }

    function outputsEqual(a, b) {
      for (const id of nodeIds) {
        const ao = a[id] || {};
        const bo = b[id] || {};
        const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
        for (const k of keys) {
          if (sigKey(ao[k]) !== sigKey(bo[k])) return false;
        }
      }
      return true;
    }

    function fullSignalSnapshot() {
      // Record every pin (inputs + outputs) for scope/history.
      const signals = {};
      for (const id of nodeIds) {
        const node = nodes[id];
        const proto = getProto(node);
        if (!proto) continue;
        const entry = {};
        // Output pins: read from outputs cache.
        for (const pin of proto.pins.out) {
          entry[pin] = (outputs[id] && outputs[id][pin]) || 'Z';
        }
        // Input pins: re-resolve from wires.
        if (proto.pins.in.length) {
          const { inputs } = collectInputs(id);
          for (const pin of proto.pins.in) entry[pin] = inputs[pin];
        }
        signals[id] = entry;
      }
      return signals;
    }

    function step() {
      // One discrete tick: snapshot, propagate, compare.
      tickCount += 1;
      const before = snapshotOutputs();
      const { conflicts } = _propagate();
      const settled = outputsEqual(before, outputs);
      return { settled, tick: tickCount, conflicts };
    }

    function run(opts) {
      const maxTicks = (opts && typeof opts.maxTicks === 'number') ? opts.maxTicks : 64;
      let last = { settled: true, tick: tickCount, conflicts: [] };
      while (tickCount < maxTicks) {
        last = step();
        // history is bounded to HISTORY_CAP entries; drop oldest when over.
        history.push({ tick: last.tick, signals: fullSignalSnapshot() });
        if (history.length > HISTORY_CAP) history.shift();
        if (last.settled) break;
      }
      return {
        settled: last.settled,
        tick: tickCount,
        conflicts: last.conflicts,
        history: history.slice(),
      };
    }

    function readOutput(label) {
      const id = padOutByLabel[label];
      if (!id) return 0;
      const { inputs } = collectInputs(id);
      const v = inputs.in;
      return v === 1 ? 1 : 0;
    }

    function getSignal(nodeId, pinName) {
      const node = nodes[nodeId];
      if (!node) return 'Z';
      const proto = getProto(node);
      if (!proto) return 'Z';
      if (proto.pins.out.includes(pinName)) {
        return (outputs[nodeId] && outputs[nodeId][pinName]) || 'Z';
      }
      if (proto.pins.in.includes(pinName)) {
        const { inputs } = collectInputs(nodeId);
        return inputs[pinName];
      }
      return 'Z';
    }

    return {
      reset,
      setInput,
      step,
      run,
      readOutput,
      getSignal,
    };
  }

  return { Sim: { create } };
});
