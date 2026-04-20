(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Analyze = mod.Analyze;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const IO = new Set(['INPUT', 'OUTPUT', 'CLOCK', 'CONST0', 'CONST1']);
  function gateCount(c) {
    let n = 0;
    for (const node of c.nodes) if (!IO.has(node.type)) n++;
    return n;
  }
  function starFor(gateCount, parGates) {
    if (gateCount <= parGates) return 3;
    if (gateCount <= parGates + 1) return 2;
    return 1;
  }
  return { Analyze: { gateCount, starFor } };
});
