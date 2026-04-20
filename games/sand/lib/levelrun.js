(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Levelrun = mod.Levelrun;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function normalizeIn(row, level) {
    if (Array.isArray(row.in)) {
      const out = {};
      level.io.inputs.forEach((p, i) => { out[p.label] = row.in[i] | 0; });
      return out;
    }
    if (row.in && typeof row.in === 'object') {
      const out = {};
      for (const p of level.io.inputs) out[p.label] = (row.in[p.label] | 0);
      if ('__clk' in row.in) out.__clk = row.in.__clk;
      return out;
    }
    return {};
  }

  function normalizeOut(row, level) {
    if (Array.isArray(row.out)) {
      const out = {};
      level.io.outputs.forEach((p, i) => { out[p.label] = row.out[i] | 0; });
      return out;
    }
    if (row.out && typeof row.out === 'object') {
      const out = {};
      for (const p of level.io.outputs) out[p.label] = (row.out[p.label] | 0);
      return out;
    }
    return {};
  }

  function run(opts) {
    const { circuit, level, Sim } = opts;
    const rowsTotal = (level.truthTable || []).length;
    let graph;
    try { graph = Sim.build(circuit); }
    catch (e) { return { pass: false, rowsPassed: 0, rowsTotal, firstFail: { row: 0, error: String(e && e.message || e) } }; }

    let clkState = 0;
    for (let i = 0; i < rowsTotal; i++) {
      const row = level.truthTable[i];
      const rin = normalizeIn(row, level);
      const expected = normalizeOut(row, level);
      let got;
      const clkTok = rin.__clk;
      if (level.sequential === true || typeof clkTok === 'string') {
        if (clkTok === 'stay') {
          const inputs = Object.assign({}, rin, { __clk: clkState });
          got = Sim.tick(graph, inputs);
        } else {
          // Default to rising edge for sequential rows.
          const inputs0 = Object.assign({}, rin, { __clk: 0 });
          Sim.tick(graph, inputs0);
          const inputs1 = Object.assign({}, rin, { __clk: 1 });
          got = Sim.tick(graph, inputs1);
          clkState = 1;
        }
      } else {
        const inputs = Object.assign({}, rin);
        delete inputs.__clk;
        got = Sim.tick(graph, inputs);
      }
      // Compare every expected output label.
      for (const k of Object.keys(expected)) {
        if ((got[k] | 0) !== (expected[k] | 0)) {
          return { pass: false, rowsPassed: i, rowsTotal, firstFail: { row: i, expected, got } };
        }
      }
    }
    return { pass: true, rowsPassed: rowsTotal, rowsTotal };
  }

  return { Levelrun: { run } };
});
