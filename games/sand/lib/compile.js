// games/sand/lib/compile.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.Compile).
//
// Task 9: compile a solved graph into a reusable black-box component.
//
// A ComponentRegistry is a plain object: id -> component definition. A
// definition captures the frozen internal graph plus the declared input /
// output pin labels (taken from pad_in / pad_out nodes, sorted alphabetically).
//
// Compile.asPrimitive(def) produces a Primitives-shaped object that Sim can
// treat like any other primitive. Internally it spins up a dedicated Sim
// runner on each init(), and on each eval() drives the internal pad_ins,
// runs the internal sim to stability, then reads the pad_outs.
//
// Limitation (documented): the internal runner runs to stability on every
// outer tick. That is fine for purely combinational black boxes. Clocked /
// stateful black boxes may need a per-outer-tick mapping rather than a
// run-to-stability — revisit in Layer 3 (memory).

(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Compile: mod.Compile };
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Compile = mod.Compile;
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  let Model, Sim, Analyze;
  if (typeof module !== 'undefined' && module.exports) {
    Model = require('./model.js').Model;
    Sim = require('./sim.js').Sim;
    Analyze = require('./analyze.js').Analyze;
  } else if (root && root.NDP && root.NDP.Sand) {
    Model = root.NDP.Sand.Model;
    Sim = root.NDP.Sand.Sim;
    Analyze = root.NDP.Sand.Analyze;
  }

  function createRegistry() {
    return { byId: {} };
  }

  function register(registry, def) {
    if (!registry || !def || !def.id) return false;
    registry.byId[def.id] = def;
    // Back-reference so asPrimitive (called from Sim) can thread the same
    // registry into nested black-box instances.
    def.__registry = registry;
    return true;
  }

  function get(registry, id) {
    if (!registry || !registry.byId) return null;
    return registry.byId[id] || null;
  }

  function labelsOfType(graph, type) {
    const out = [];
    for (const id of Object.keys(graph.nodes)) {
      const n = graph.nodes[id];
      if (n.type === type) {
        const label = (n.props && n.props.label) ? String(n.props.label) : '';
        if (label) out.push(label);
      }
    }
    out.sort();
    // Dedupe while preserving order (sorted).
    const dedup = [];
    for (const l of out) if (dedup[dedup.length - 1] !== l) dedup.push(l);
    return dedup;
  }

  function freezeInternal(graph) {
    // Serialize then parse — gives us a fully detached, plain-JSON snapshot
    // with stable key order. Sim.create accepts this shape (it reads
    // graph.nodes and graph.wires as id-keyed maps, and Model.toJSON returns
    // arrays). So we rehydrate via Model.fromJSON after freezing.
    const json = Model.toJSON(graph);
    // Deep-freeze the JSON snapshot to prevent accidental mutation.
    function deepFreeze(o) {
      if (o && typeof o === 'object') {
        Object.freeze(o);
        for (const k of Object.keys(o)) deepFreeze(o[k]);
      }
      return o;
    }
    deepFreeze(json);
    return json;
  }

  function compile(graph, opts) {
    const id = opts && opts.id;
    if (!id) throw new Error('Compile.compile: opts.id is required');
    const name = (opts && opts.name) || id;
    const icon = (opts && opts.icon) || null;

    const inputPins = labelsOfType(graph, 'pad_in');
    const outputPins = labelsOfType(graph, 'pad_out');
    const internal = freezeInternal(graph);
    const td = Analyze.tickDepth(graph);

    return {
      id,
      name,
      icon,
      inputPins,
      outputPins,
      internal,
      tickDepth: td,
    };
  }

  // Turn a compiled component definition into a Primitives-shaped object so
  // Sim can evaluate instances of it uniformly. Each instance (node in the
  // outer graph) gets its own internal Sim runner via init().
  function asPrimitive(def) {
    const registry = def.__registry || null;

    function buildInternalGraph() {
      // internal is a frozen JSON snapshot; rehydrate a fresh mutable graph.
      return Model.fromJSON(def.internal);
    }

    return {
      pins: { in: def.inputPins.slice(), out: def.outputPins.slice() },
      defaultProps: {},
      init(_props) {
        const internalGraph = buildInternalGraph();
        const runner = Sim.create(internalGraph, {
          componentRegistry: registry,
        });
        runner.reset();
        return { runner };
      },
      eval(inputs, state, _props) {
        const runner = state && state.runner;
        if (!runner) {
          const empty = {};
          for (const p of def.outputPins) empty[p] = 'Z';
          return { outputs: empty, nextState: state };
        }
        // Drive internal pad_ins from the outer-tick inputs map. Unknown /
        // floating signals get mapped to 0 (setInput coerces non-1 to 0);
        // that mirrors how a real pad_in materialises its value.
        for (const label of def.inputPins) {
          const v = inputs && inputs[label];
          runner.setInput(label, v === 1 ? 1 : 0);
        }
        // Run to stability within a generous per-outer-tick budget.
        const budget = Math.max(8, (def.tickDepth | 0) * 4 + 8);
        runner.run({ maxTicks: budget });
        const outputs = {};
        for (const label of def.outputPins) {
          const val = runner.readOutput(label);
          outputs[label] = val === 1 ? 1 : 0;
        }
        return { outputs, nextState: state };
      },
    };
  }

  function peekInside(registry, id) {
    const def = get(registry, id);
    if (!def || !def.internal) return null;
    // Deep-clone the frozen internal JSON snapshot so callers get a mutable
    // copy they can modify without affecting the stored definition.
    return JSON.parse(JSON.stringify(def.internal));
  }

  const Compile = {
    createRegistry,
    register,
    get,
    compile,
    asPrimitive,
    peekInside,
  };

  return { Compile };
});
