// games/sand/lib/levelrun.js
// Dual-entry module: Node (CommonJS) and browser (window.NDP.Sand.LevelRun).
//
// Task 11: truth-table test runner.
// Task 12: star scorer.
//
// LevelRun.test drives a graph through each row of a levelSpec truth table
// and reports per-row pass/fail plus aggregated settled/conflicts data.
// LevelRun.score turns a test result + caller-supplied gate/tick analysis
// into a 0-3 star rating according to levelSpec.starGoals thresholds.

(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LevelRun: mod.LevelRun };
  }
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.LevelRun = mod.LevelRun;
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  let Sim;
  if (typeof module !== 'undefined' && module.exports) {
    Sim = require('./sim.js').Sim;
  } else if (root && root.NDP && root.NDP.Sand) {
    Sim = root.NDP.Sand.Sim;
  }

  function arraysEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i] | 0) !== (b[i] | 0)) return false;
    }
    return true;
  }

  function test(graph, levelSpec, opts) {
    opts = opts || {};
    const maxTicks = typeof opts.maxTicks === 'number' ? opts.maxTicks : 64;
    const registry = opts.componentRegistry || null;

    const inputs = (levelSpec.io && levelSpec.io.inputs) || [];
    const outputs = (levelSpec.io && levelSpec.io.outputs) || [];
    const table = levelSpec.truthTable || [];

    const runner = Sim.create(graph, { componentRegistry: registry });

    const rows = [];
    const conflicts = [];
    let allSettled = true;
    let firstFailure = -1;

    for (let i = 0; i < table.length; i++) {
      const row = table[i];
      runner.reset();
      for (let k = 0; k < inputs.length; k++) {
        runner.setInput(inputs[k], row.in[k]);
      }
      const r = runner.run({ maxTicks });
      const actual = {};
      const expected = {};
      const actualArr = [];
      const expectedArr = [];
      for (let k = 0; k < outputs.length; k++) {
        const label = outputs[k];
        const v = runner.readOutput(label);
        actual[label] = v;
        actualArr.push(v);
        expected[label] = row.out[k];
        expectedArr.push(row.out[k]);
      }
      const match = arraysEqual(actualArr, expectedArr);
      if (!match && firstFailure === -1) firstFailure = i;
      if (!r.settled) allSettled = false;
      if (r.conflicts && r.conflicts.length) {
        for (const c of r.conflicts) conflicts.push(c);
      }

      const inputsMap = {};
      for (let k = 0; k < inputs.length; k++) inputsMap[inputs[k]] = row.in[k];

      rows.push({
        inputs: inputsMap,
        expected,
        actual,
        settled: !!r.settled,
        ticks: r.tick | 0,
        match,
      });
    }

    const passed = firstFailure === -1 && rows.length > 0;
    return {
      passed,
      rows,
      firstFailure,
      settled: allSettled,
      conflicts,
    };
  }

  function starFor(value, goals) {
    if (!goals) return 1;
    if (typeof goals['3star'] === 'number' && value <= goals['3star']) return 3;
    if (typeof goals['2star'] === 'number' && value <= goals['2star']) return 2;
    return 1;
  }

  function score(result, analysis, levelSpec) {
    if (!result || !result.passed) {
      return { stars: 0, gatesStar: 1, ticksStar: 1 };
    }
    const goals = (levelSpec && levelSpec.starGoals) || {};
    const gates = (analysis && analysis.gates) | 0;
    const ticks = (analysis && analysis.ticks) | 0;
    const gatesStar = starFor(gates, goals.gates);
    const ticksStar = starFor(ticks, goals.ticks);
    let stars = Math.min(gatesStar, ticksStar);
    if (stars < 1) stars = 1;
    return { stars, gatesStar, ticksStar };
  }

  const LevelRun = { test, score };
  return { LevelRun };
});
