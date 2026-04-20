(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Sim = mod.Sim;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SEQ_TYPES = new Set(['DLATCH', 'DFF', 'SRLATCH']);
  const COMBO_FN = {
    NOT:  (a)    => a ? 0 : 1,
    AND:  (a, b) => (a && b) ? 1 : 0,
    OR:   (a, b) => (a || b) ? 1 : 0,
    NAND: (a, b) => (a && b) ? 0 : 1,
    NOR:  (a, b) => (a || b) ? 0 : 1,
    XOR:  (a, b) => (a ^ b) & 1,
    XNOR: (a, b) => (a ^ b) ? 0 : 1
  };

  function build(circuit) {
    const nodes = new Map();
    for (const n of circuit.nodes) {
      nodes.set(n.id, Object.assign({}, n, { out: {}, state: {} }));
    }
    const wiresByDst = new Map();
    for (const w of circuit.wires) {
      const key = w.to.node + '.' + w.to.pin;
      const list = wiresByDst.get(key) || [];
      list.push({ fromNode: w.from.node, fromPin: w.from.pin });
      wiresByDst.set(key, list);
    }
    const adj = new Map();
    for (const n of circuit.nodes) adj.set(n.id, new Set());
    for (const w of circuit.wires) {
      const dstNode = nodes.get(w.to.node);
      if (!dstNode) continue;
      if (SEQ_TYPES.has(dstNode.type)) continue;
      adj.get(w.to.node).add(w.from.node);
    }
    const order = [];
    const temp = new Set();
    const perm = new Set();
    function visit(id) {
      if (perm.has(id)) return;
      if (temp.has(id)) throw new Error('combinational cycle at ' + id);
      temp.add(id);
      const deps = adj.get(id);
      if (deps) for (const dep of deps) visit(dep);
      temp.delete(id);
      perm.add(id);
      order.push(id);
    }
    for (const id of adj.keys()) visit(id);
    const seqIds = [];
    for (const [id, n] of nodes) if (SEQ_TYPES.has(n.type)) seqIds.push(id);
    return { nodes, wiresByDst, order, seqIds };
  }

  function reset(g) {
    for (const n of g.nodes.values()) { n.out = {}; n.state = {}; }
  }

  function readPin(g, nodeId, pin) {
    const wires = g.wiresByDst.get(nodeId + '.' + pin);
    if (!wires || !wires.length) return 0;
    const w = wires[0];
    const src = g.nodes.get(w.fromNode);
    if (!src) return 0;
    return (src.out[w.fromPin] | 0);
  }

  function tick(g, inputsMap) {
    inputsMap = inputsMap || {};
    // 1. Prime INPUT / CONST / CLOCK outputs.
    for (const n of g.nodes.values()) {
      if (n.type === 'INPUT')  n.out.y = (inputsMap[n.props && n.props.label] | 0) & 1;
      if (n.type === 'CONST0') n.out.y = 0;
      if (n.type === 'CONST1') n.out.y = 1;
      if (n.type === 'CLOCK')  n.out.y = (inputsMap.__clk | 0) & 1;
    }
    // 2. Combinational in topo order.
    function runCombo() {
      for (const id of g.order) {
        const n = g.nodes.get(id);
        if (!n) continue;
        if (n.type === 'INPUT' || n.type === 'CONST0' || n.type === 'CONST1' || n.type === 'CLOCK') continue;
        if (n.type === 'NOT') {
          n.out.y = COMBO_FN.NOT(readPin(g, id, 'a'));
        } else if (COMBO_FN[n.type]) {
          n.out.y = COMBO_FN[n.type](readPin(g, id, 'a'), readPin(g, id, 'b'));
        } else if (n.type === 'OUTPUT') {
          n.out.value = readPin(g, id, 'a');
        }
      }
    }
    runCombo();
    // 3. Sequential capture/commit.
    for (const id of g.seqIds) {
      const n = g.nodes.get(id);
      const prevQ = (n.state.q | 0);
      let nextQ = prevQ;
      if (n.type === 'DFF') {
        const clk = readPin(g, id, 'clk') | 0;
        const d   = readPin(g, id, 'd') | 0;
        if (clk && !n.state.lastClk) nextQ = d;
        n.state.lastClk = clk;
      } else if (n.type === 'DLATCH') {
        const en = readPin(g, id, 'en') | 0;
        const d  = readPin(g, id, 'd') | 0;
        if (en) nextQ = d;
      } else if (n.type === 'SRLATCH') {
        const s = readPin(g, id, 's') | 0;
        const r = readPin(g, id, 'r') | 0;
        if (s && !r) nextQ = 1;
        else if (r && !s) nextQ = 0;
      }
      n.state.q = nextQ;
      n.out.q  = nextQ;
      n.out.qn = nextQ ? 0 : 1;
    }
    // 3b. Re-run combo so OUTPUTs see updated sequential state.
    if (g.seqIds.length) runCombo();
    // 4. Collect OUTPUT labels.
    const out = {};
    for (const n of g.nodes.values()) {
      if (n.type === 'OUTPUT') out[n.props && n.props.label] = (n.out.value | 0);
    }
    return out;
  }

  return { Sim: { build, reset, tick } };
});
