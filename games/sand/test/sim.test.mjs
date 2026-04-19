// games/sand/test/sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Model } = require('../lib/model.js');
const { Sim } = require('../lib/sim.js');

// -- small helpers ---------------------------------------------------------

function newGraph() {
  return Model.create();
}

function addPadIn(g, label) {
  return Model.addNode(g, { type: 'pad_in', props: { label, value: 0 } });
}
function addPadOut(g, label) {
  return Model.addNode(g, { type: 'pad_out', props: { label } });
}
function addNode(g, type) {
  return Model.addNode(g, { type });
}
function wire(g, fromNode, fromPin, toNode, toPin) {
  const w = Model.addWire(g, {
    from: { node: fromNode.id, pin: fromPin },
    to:   { node: toNode.id,   pin: toPin   },
  });
  if (!w) throw new Error(`failed wire ${fromNode.id}.${fromPin} -> ${toNode.id}.${toPin}`);
  return w;
}

// buildGate: runs a hand-wiring fn against a fresh graph and returns a runner.
function buildGate(build) {
  const g = newGraph();
  build(g);
  return Sim.create(g);
}

function truth1(runner, table) {
  for (const [a, y] of table) {
    runner.reset();
    runner.setInput('A', a);
    const r = runner.run({ maxTicks: 32 });
    assert.ok(r.settled, `not settled for A=${a}`);
    assert.equal(runner.readOutput('Y'), y, `A=${a} expected Y=${y}`);
  }
}

function truth2(runner, table) {
  for (const [a, b, y] of table) {
    runner.reset();
    runner.setInput('A', a);
    runner.setInput('B', b);
    const r = runner.run({ maxTicks: 32 });
    assert.ok(r.settled, `not settled for A=${a} B=${b}`);
    assert.equal(runner.readOutput('Y'), y, `A=${a} B=${b} expected Y=${y}, got ${runner.readOutput('Y')}`);
  }
}

// -- 1. NOT ---------------------------------------------------------------

test('NOT: pullup on switch.out, ground -> switch.in', () => {
  const runner = buildGate(g => {
    const A  = addPadIn(g, 'A');
    const Y  = addPadOut(g, 'Y');
    const gnd = addNode(g, 'ground');
    const sw  = addNode(g, 'switch');
    const pu  = addNode(g, 'pullup');
    wire(g, gnd, 'out', sw, 'in');
    wire(g, A,   'out', sw, 'gate');
    wire(g, sw,  'out', pu, 'a');
    wire(g, pu,  'out', Y,  'in');
  });
  truth1(runner, [[0, 1], [1, 0]]);
});

// -- 2. AND ---------------------------------------------------------------

test('AND: two switches in series between power and output', () => {
  const runner = buildGate(g => {
    const A  = addPadIn(g, 'A');
    const B  = addPadIn(g, 'B');
    const Y  = addPadOut(g, 'Y');
    const pwr = addNode(g, 'power');
    const sA  = addNode(g, 'switch');
    const sB  = addNode(g, 'switch');
    wire(g, pwr, 'out', sA, 'in');
    wire(g, sA,  'out', sB, 'in');
    wire(g, sB,  'out', Y,  'in');
    wire(g, A,   'out', sA, 'gate');
    wire(g, B,   'out', sB, 'gate');
  });
  // pad_out default-pulls Z to 0, so no pullup needed for AND-to-0 behavior.
  truth2(runner, [
    [0, 0, 0],
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, 1],
  ]);
});

// -- 3. OR ----------------------------------------------------------------

test('OR: two switches in parallel between power and output (wire-OR)', () => {
  const runner = buildGate(g => {
    const A  = addPadIn(g, 'A');
    const B  = addPadIn(g, 'B');
    const Y  = addPadOut(g, 'Y');
    const pwr = addNode(g, 'power');
    const sA  = addNode(g, 'switch');
    const sB  = addNode(g, 'switch');
    wire(g, pwr, 'out', sA, 'in');
    wire(g, pwr, 'out', sB, 'in');
    wire(g, sA,  'out', Y,  'in');
    wire(g, sB,  'out', Y,  'in');   // two drivers on same pin
    wire(g, A,   'out', sA, 'gate');
    wire(g, B,   'out', sB, 'gate');
  });
  truth2(runner, [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ]);
});

// -- 4. NAND --------------------------------------------------------------

test('NAND: two switches in series to ground, pullup on output', () => {
  const runner = buildGate(g => {
    const A  = addPadIn(g, 'A');
    const B  = addPadIn(g, 'B');
    const Y  = addPadOut(g, 'Y');
    const gnd = addNode(g, 'ground');
    const sA  = addNode(g, 'switch');
    const sB  = addNode(g, 'switch');
    const pu  = addNode(g, 'pullup');
    wire(g, gnd, 'out', sA, 'in');
    wire(g, sA,  'out', sB, 'in');
    wire(g, sB,  'out', pu, 'a');
    wire(g, pu,  'out', Y,  'in');
    wire(g, A,   'out', sA, 'gate');
    wire(g, B,   'out', sB, 'gate');
  });
  truth2(runner, [
    [0, 0, 1],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ]);
});

// -- 5. NOR ---------------------------------------------------------------

test('NOR: two switches in parallel to ground, pullup on output', () => {
  const runner = buildGate(g => {
    const A  = addPadIn(g, 'A');
    const B  = addPadIn(g, 'B');
    const Y  = addPadOut(g, 'Y');
    const gnd = addNode(g, 'ground');
    const sA  = addNode(g, 'switch');
    const sB  = addNode(g, 'switch');
    const pu  = addNode(g, 'pullup');
    wire(g, gnd, 'out', sA, 'in');
    wire(g, gnd, 'out', sB, 'in');
    wire(g, sA,  'out', pu, 'a');
    wire(g, sB,  'out', pu, 'a');   // wire-OR into pullup input
    wire(g, pu,  'out', Y,  'in');
    wire(g, A,   'out', sA, 'gate');
    wire(g, B,   'out', sB, 'gate');
  });
  truth2(runner, [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, 0],
  ]);
});

// -- 6. XOR: (A AND NOT B) OR (NOT A AND B) ------------------------------

test('XOR: composed from primitive AND/NOT/OR fragments', () => {
  // Layout:
  //   NOT_A : gnd -> sNa.in, A -> sNa.gate, pullup pNa.a = sNa.out -> notA
  //   NOT_B : gnd -> sNb.in, B -> sNb.gate, pullup pNb.a = sNb.out -> notB
  //   AND1  : pwr -> sA1.in, sA1.out -> sA2.in, sA2.out -> tAB1
  //           sA1.gate = A, sA2.gate = notB
  //   AND2  : pwr -> sB1.in, sB1.out -> sB2.in, sB2.out -> tAB2
  //           sB1.gate = notA, sB2.gate = B
  //   OR    : tAB1 and tAB2 wire-OR onto Y
  const runner2 = buildGate(g => {
    const A  = addPadIn(g, 'A');
    const B  = addPadIn(g, 'B');
    const Y  = addPadOut(g, 'Y');
    const pwr = addNode(g, 'power');
    const gnd1 = addNode(g, 'ground');
    const gnd2 = addNode(g, 'ground');

    const sNa = addNode(g, 'switch');   // NOT A
    const pNa = addNode(g, 'pullup');
    wire(g, gnd1, 'out', sNa, 'in');
    wire(g, A,    'out', sNa, 'gate');
    wire(g, sNa,  'out', pNa, 'a');

    const sNb = addNode(g, 'switch');   // NOT B
    const pNb = addNode(g, 'pullup');
    wire(g, gnd2, 'out', sNb, 'in');
    wire(g, B,    'out', sNb, 'gate');
    wire(g, sNb,  'out', pNb, 'a');

    // AND1 = A AND notB
    const sA1 = addNode(g, 'switch');
    const sA2 = addNode(g, 'switch');
    wire(g, pwr, 'out', sA1, 'in');
    wire(g, sA1, 'out', sA2, 'in');
    wire(g, A,   'out', sA1, 'gate');
    wire(g, pNb, 'out', sA2, 'gate');

    // AND2 = notA AND B
    const sB1 = addNode(g, 'switch');
    const sB2 = addNode(g, 'switch');
    wire(g, pwr, 'out', sB1, 'in');
    wire(g, sB1, 'out', sB2, 'in');
    wire(g, pNa, 'out', sB1, 'gate');
    wire(g, B,   'out', sB2, 'gate');

    // OR wire-ORs both AND outputs onto Y.
    wire(g, sA2, 'out', Y, 'in');
    wire(g, sB2, 'out', Y, 'in');
  });
  truth2(runner2, [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ]);
});

// -- extras ----------------------------------------------------------------

test('conflict detected: power + ground into same pin', () => {
  const runner = buildGate(g => {
    const Y  = addPadOut(g, 'Y');
    const pwr = addNode(g, 'power');
    const gnd = addNode(g, 'ground');
    // Drive pad_out.in with both 1 and 0: guaranteed conflict.
    wire(g, pwr, 'out', Y, 'in');
    wire(g, gnd, 'out', Y, 'in');
  });
  const r = runner.run({ maxTicks: 32 });
  assert.ok(r.conflicts.length > 0, 'expected at least one conflict');
  const c = r.conflicts[0];
  assert.equal(c.pin, 'in');
});

test('run returns settled for combinational graph with no loops', () => {
  // Simple chain: power -> pullup -> pad_out.
  const runner = buildGate(g => {
    const Y  = addPadOut(g, 'Y');
    const pwr = addNode(g, 'power');
    const pu  = addNode(g, 'pullup');
    wire(g, pwr, 'out', pu, 'a');
    wire(g, pu,  'out', Y,  'in');
  });
  const r = runner.run({ maxTicks: 32 });
  assert.equal(r.settled, true);
  assert.equal(r.conflicts.length, 0);
  assert.equal(runner.readOutput('Y'), 1);
});

// -- Task 7: tick budget, settle detection, history ----------------------

// Classic ring oscillator: a NOT gate with its output fed back to its input.
//   ground -> sA.in
//   sA.out -> pullup.a
//   pullup.out -> sA.gate   (feedback loop)
// Each tick flips: gate -> out -> pullup -> gate ...
function buildOscillator() {
  return buildGate(g => {
    const gnd = addNode(g, 'ground');
    const sA  = addNode(g, 'switch');
    const pu  = addNode(g, 'pullup');
    const Y   = addPadOut(g, 'Y');
    wire(g, gnd, 'out', sA, 'in');
    wire(g, sA,  'out', pu, 'a');
    wire(g, pu,  'out', sA, 'gate');   // the loop
    wire(g, pu,  'out', Y,  'in');     // observe
  });
}

test('oscillator does not settle in 64 ticks', () => {
  const runner = buildOscillator();
  const r = runner.run({ maxTicks: 64 });
  assert.equal(r.settled, false);
  assert.equal(r.tick, 64);
  assert.ok(r.history.length <= 64);
  assert.ok(r.history.length > 0);
  // Each history entry must carry a tick number and a signals map.
  for (const entry of r.history) {
    assert.equal(typeof entry.tick, 'number');
    assert.equal(typeof entry.signals, 'object');
  }
});

test('combinational graph settles in < N ticks and history grows', () => {
  // power -> pullup -> pad_out  (trivially settles).
  const runner = buildGate(g => {
    const Y  = addPadOut(g, 'Y');
    const pwr = addNode(g, 'power');
    const pu  = addNode(g, 'pullup');
    wire(g, pwr, 'out', pu, 'a');
    wire(g, pu,  'out', Y,  'in');
  });
  const r = runner.run({ maxTicks: 32 });
  assert.equal(r.settled, true);
  assert.ok(r.tick < 32, `expected settle well under budget, got ${r.tick}`);
  assert.ok(r.history.length >= 1);
  assert.equal(r.history.length, r.tick);
});

test('reset clears tick and history', () => {
  const runner = buildOscillator();
  const r1 = runner.run({ maxTicks: 8 });
  assert.ok(r1.tick > 0);
  assert.ok(r1.history.length > 0);
  runner.reset();
  // After reset, another run starts fresh.
  const r2 = runner.run({ maxTicks: 4 });
  assert.equal(r2.tick, 4); // oscillator never settles, so hits the 4-tick budget
  assert.equal(r2.history.length, 4);
});

test('history capped at 256 entries even for long runs', () => {
  const runner = buildOscillator();
  const r = runner.run({ maxTicks: 300 });
  assert.equal(r.settled, false);
  assert.equal(r.tick, 300);
  assert.ok(r.history.length <= 256, `history.length=${r.history.length}`);
  assert.equal(r.history.length, 256);
});
