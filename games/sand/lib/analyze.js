// games/sand/lib/analyze.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.Analyze).
//
// Static graph analysis utilities:
//   Analyze.tickDepth(graph)   -> longest pad_in -> pad_out path in intermediate
//                                 nodes (gates). Infinity if a cycle is reachable
//                                 from any pad_in. 0 if no pad_out is reachable.
//   Analyze.gateCount(graph)   -> number of nodes whose type is not in
//                                 { pad_in, pad_out, power, ground, clock }.
//   Analyze.reachable(graph)   -> { fromInputs, toOutputs } sets of node ids.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Analyze: mod.Analyze };
    module.exports.Analyze = mod.Analyze;
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Analyze = mod.Analyze;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const NON_GATE = new Set(['pad_in', 'pad_out', 'power', 'ground', 'clock']);

  function buildAdj(graph) {
    // adj[nodeId] = array of successor nodeIds (deduped).
    const adj = {};
    for (const id of Object.keys(graph.nodes)) adj[id] = [];
    const seen = new Set();
    for (const wid of Object.keys(graph.wires)) {
      const w = graph.wires[wid];
      const key = w.from.node + '->' + w.to.node;
      if (seen.has(key)) continue;
      seen.add(key);
      if (adj[w.from.node]) adj[w.from.node].push(w.to.node);
    }
    return adj;
  }

  function nodesOfType(graph, type) {
    const out = [];
    for (const id of Object.keys(graph.nodes)) {
      if (graph.nodes[id].type === type) out.push(id);
    }
    return out;
  }

  // Longest path from `start` to any pad_out, counting intermediate nodes
  // (nodes that are NOT pad_in nor pad_out). Returns Infinity on cycle.
  //
  // 3-color DFS: 0 = white (unvisited), 1 = gray (on stack), 2 = black (done).
  // memo[id] = longest gate-count from id to any pad_out, or -Infinity if none,
  // or Infinity if a cycle lies on a path from id forward.
  function longestFromNode(graph, adj, startId) {
    const nodes = graph.nodes;
    const color = {};
    const memo = {};

    function dfs(id) {
      if (color[id] === 1) return Infinity; // cycle
      if (color[id] === 2) return memo[id];
      color[id] = 1;

      const node = nodes[id];
      let best = -Infinity;
      if (node.type === 'pad_out') {
        // reached an output; path contributes no further gates.
        best = 0;
      }

      for (const next of adj[id] || []) {
        const sub = dfs(next);
        if (sub === Infinity) { memo[id] = Infinity; color[id] = 2; return Infinity; }
        if (sub === -Infinity) continue;
        // Traversing `next` adds 1 gate iff `next` is an intermediate node.
        const nextNode = nodes[next];
        const addGate = (nextNode.type !== 'pad_in' && nextNode.type !== 'pad_out') ? 1 : 0;
        const cand = sub + addGate;
        if (cand > best) best = cand;
      }

      memo[id] = best;
      color[id] = 2;
      return best;
    }

    return dfs(startId);
  }

  function tickDepth(graph) {
    const adj = buildAdj(graph);
    const padIns = nodesOfType(graph, 'pad_in');
    if (padIns.length === 0) return 0;

    let best = 0;
    for (const id of padIns) {
      const r = longestFromNode(graph, adj, id);
      if (r === Infinity) return Infinity;
      if (r === -Infinity) continue;
      // pad_in itself does not count as a gate; r already excludes it
      // because longestFromNode only adds 1 when stepping into a non-pad node.
      if (r > best) best = r;
    }
    return best;
  }

  function gateCount(graph) {
    let n = 0;
    for (const id of Object.keys(graph.nodes)) {
      if (!NON_GATE.has(graph.nodes[id].type)) n++;
    }
    return n;
  }

  function reachable(graph) {
    const adj = buildAdj(graph);
    // reverse adjacency
    const radj = {};
    for (const id of Object.keys(graph.nodes)) radj[id] = [];
    for (const from of Object.keys(adj)) {
      for (const to of adj[from]) radj[to].push(from);
    }

    function bfs(starts, adjMap) {
      const seen = new Set();
      const stack = starts.slice();
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        for (const nx of adjMap[id] || []) {
          if (!seen.has(nx)) stack.push(nx);
        }
      }
      return seen;
    }

    const fromInputs = bfs(nodesOfType(graph, 'pad_in'), adj);
    const toOutputs = bfs(nodesOfType(graph, 'pad_out'), radj);
    return { fromInputs, toOutputs };
  }

  const Analyze = { tickDepth, gateCount, reachable };
  return { Analyze };
});
